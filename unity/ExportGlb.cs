using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityGLTF;

public static class ExportGlb
{
    // embeddedClips: take every animation stored in the model file itself (one FBX, many takes).
    [Serializable] class Item { public string name; public string kind; public string asset; public string material; public string[] clips; public bool showAll; public bool embeddedClips; }
    [Serializable] class ExportList { public string outDir; public Item[] items; }

    const string TempDir = "Assets/__export_tmp";

    // Unity.exe -batchmode -quit -projectPath <p> -executeMethod ExportGlb.Run -exportList <json>
    public static void Run()
    {
        var args = Environment.GetCommandLineArgs();
        var at = Array.IndexOf(args, "-exportList");
        if (at < 0 || at + 1 >= args.Length) throw new ArgumentException("-exportList <path> is required");
        var list = JsonUtility.FromJson<ExportList>(File.ReadAllText(args[at + 1]));
        var outDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), list.outDir));
        Directory.CreateDirectory(outDir);
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);

        var failures = new List<string>();
        foreach (var item in list.items)
        {
            try { ExportOne(item, outDir); Debug.Log("[ExportGlb] OK " + item.name); }
            catch (Exception e) { failures.Add(item.name); Debug.LogError("[ExportGlb] FAIL " + item.name + ": " + e); }
        }
        if (failures.Count > 0) EditorApplication.Exit(1);
    }

    static void ExportOne(Item item, string outDir)
    {
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(item.asset);
        if (source == null) throw new FileNotFoundException(item.asset);
        var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
        try
        {
            instance.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            // A modular character ships every part; the game picks which to show.
            if (item.showAll) foreach (var t in instance.GetComponentsInChildren<Transform>(true)) t.gameObject.SetActive(true);
            if (!string.IsNullOrEmpty(item.material)) ApplyMaterial(instance, item.material);
            StandardizeMaterials(instance);
            if (item.kind == "character") AttachClips(instance, item.embeddedClips ? EmbeddedClips(item.asset) : LoadClips(item.clips));
            // UnityGLTF's humanoid sampler ends with Undo.PerformUndo(), which would
            // otherwise undo our AddState calls and destroy the controller's states.
            Undo.ClearAll();

            var settings = GLTFSettings.GetOrCreateSettings();
            settings.ExportAnimations = item.kind == "character";
            settings.UniqueAnimationNames = false;
            var exporter = new GLTFSceneExporter(new[] { instance.transform }, new ExportContext(settings));
            exporter.SaveGLB(outDir, item.name);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(instance);
            if (AssetDatabase.IsValidFolder(TempDir)) AssetDatabase.DeleteAsset(TempDir);
        }
    }

    // Texture slots custom shaders keep their colour in (Polytope Studio's shaders among them).
    static readonly string[] BaseTextureSlots = { "_BaseTexture", "_BaseMap", "_MainTex", "_Exteriorwallstexture", "_Albedo" };
    // Materials whose texture is a cut-out card (leaves, grass, flowers).
    static readonly string[] CutoutWords = { "Leaves", "Leaf", "Foliage", "Grass", "Poppy", "Flower" };

    // UnityGLTF only understands the built-in and URP lit shaders; anything else would lose its
    // texture and come out white. Such materials are swapped for a lit one carrying the same
    // texture, tint and name.
    static void StandardizeMaterials(GameObject instance)
    {
        var lit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        var made = new Dictionary<Material, Material>();
        foreach (var r in instance.GetComponentsInChildren<Renderer>())
        {
            var mats = r.sharedMaterials;
            for (var i = 0; i < mats.Length; i++)
            {
                var src = mats[i];
                if (src == null || src.shader == null) continue;
                var shader = src.shader.name;
                if (shader == "Standard" || shader.StartsWith("Universal Render Pipeline/") || shader.StartsWith("Legacy Shaders/")) continue;
                if (!made.TryGetValue(src, out var swap))
                {
                    swap = new Material(lit) { name = src.name };
                    var tex = BaseTextureSlots.Where(src.HasProperty).Select(src.GetTexture).FirstOrDefault(t => t != null)
                        ?? SavedTexture(src);
                    if (tex != null) { swap.SetTexture("_BaseMap", tex); swap.SetTexture("_MainTex", tex); }
                    var tint = src.HasProperty("_Color") ? src.GetColor("_Color") : Color.white;
                    // The free Polytope pack leaves out its village textures; the wooden gate and bridge get
                    // a plain wood colour instead of white.
                    if (tex == null && src.name.Contains("Buildings")) tint = new Color(0.55f, 0.38f, 0.23f);
                    swap.SetColor("_BaseColor", tint);
                    swap.SetColor("_Color", tint);
                    if (CutoutWords.Any(w => src.name.Contains(w)))
                    {
                        swap.SetFloat("_AlphaClip", 1);
                        swap.SetFloat("_Cutoff", 0.5f);
                        swap.EnableKeyword("_ALPHATEST_ON");
                        swap.renderQueue = 2450;
                    }
                    made[src] = swap;
                }
                mats[i] = swap;
            }
            r.sharedMaterials = mats;
        }
    }

    // Texture slots the current shader does not declare are invisible to the Material API but still
    // saved in the .mat file; read the first one whose name says it is the base colour.
    static Texture SavedTexture(Material src)
    {
        var path = AssetDatabase.GetAssetPath(src);
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
        var lines = File.ReadAllLines(path);
        string[] wanted = { "BASE", "MAINTEX", "EXTERIOR", "ALBEDO" };
        for (var i = 0; i + 1 < lines.Length; i++)
        {
            var name = lines[i].Trim().TrimStart('-').Trim().TrimEnd(':').ToUpperInvariant();
            if (!wanted.Any(name.Contains)) continue;
            var guidAt = lines[i + 1].IndexOf("guid: ", StringComparison.Ordinal);
            if (guidAt < 0) continue;
            var guid = lines[i + 1].Substring(guidAt + 6).Split(',')[0].Trim();
            var tex = AssetDatabase.LoadAssetAtPath<Texture>(AssetDatabase.GUIDToAssetPath(guid));
            if (tex != null) return tex;
        }
        return null;
    }

    static void ApplyMaterial(GameObject instance, string path)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (mat == null) throw new FileNotFoundException(path);
        foreach (var r in instance.GetComponentsInChildren<Renderer>())
            r.sharedMaterials = Enumerable.Repeat(mat, r.sharedMaterials.Length).ToArray();
    }

    // One clip per file, renamed after the file (FBX takes are often all named "Take 001").
    static List<AnimationClip> LoadClips(string[] clipPaths)
    {
        var clips = new List<AnimationClip>();
        foreach (var path in clipPaths)
        {
            var clip = UnityEngine.Object.Instantiate(LoadClip(path));
            clip.name = Path.GetFileNameWithoutExtension(path);
            clips.Add(clip);
        }
        return clips;
    }

    // Every take inside the model file, under its own name.
    static List<AnimationClip> EmbeddedClips(string assetPath)
    {
        var clips = new List<AnimationClip>();
        foreach (var clip in AssetDatabase.LoadAllAssetsAtPath(assetPath).OfType<AnimationClip>())
        {
            if (clip.name.StartsWith("__preview__")) continue;
            var copy = UnityEngine.Object.Instantiate(clip);
            // "RatArmature|Rat_Attack" -> "Attack": the take after the rig, without the model's name.
            var take = clip.name.Substring(clip.name.LastIndexOf('|') + 1);
            var underscore = take.IndexOf('_');
            copy.name = underscore > 0 ? take.Substring(underscore + 1) : take;
            clips.Add(copy);
        }
        if (clips.Count == 0) throw new FileNotFoundException("no AnimationClip in " + assetPath);
        return clips;
    }

    static void AttachClips(GameObject instance, List<AnimationClip> clips)
    {
        AssetDatabase.CreateFolder("Assets", "__export_tmp");
        // Clips are all written before the controller exists: creating assets mid-way
        // reimports the folder and leaves earlier AnimatorState handles destroyed.
        var clipAssets = new List<string>();
        foreach (var copy in clips)
        {
            var copyPath = TempDir + "/" + copy.name + ".anim";
            AssetDatabase.CreateAsset(copy, copyPath);
            clipAssets.Add(copyPath);
        }
        AssetDatabase.SaveAssets();

        const string controllerPath = TempDir + "/tmp.controller";
        var built = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
        foreach (var copyPath in clipAssets)
        {
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(copyPath);
            built.layers[0].stateMachine.AddState(clip.name).motion = clip;
        }
        EditorUtility.SetDirty(built);
        AssetDatabase.SaveAssets();

        var animator = instance.GetComponent<Animator>();
        if (animator == null) animator = instance.AddComponent<Animator>();
        animator.runtimeAnimatorController = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
        // UnityGLTF skips humanoid clips on an Animator without an avatar.
        if (animator.avatar == null) animator.avatar = FindAvatar(instance);
    }

    static Avatar FindAvatar(GameObject instance)
    {
        foreach (var smr in instance.GetComponentsInChildren<SkinnedMeshRenderer>())
        {
            if (smr.sharedMesh == null) continue;
            var avatar = AssetDatabase.LoadAllAssetsAtPath(AssetDatabase.GetAssetPath(smr.sharedMesh)).OfType<Avatar>().FirstOrDefault();
            if (avatar != null) return avatar;
        }
        return null;
    }

    static AnimationClip LoadClip(string path)
    {
        var clip = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>()
            .FirstOrDefault(c => !c.name.StartsWith("__preview__"));
        if (clip == null) throw new FileNotFoundException("no AnimationClip in " + path);
        return clip;
    }
}
