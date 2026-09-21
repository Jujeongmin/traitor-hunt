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
    [Serializable] class Item { public string name; public string kind; public string asset; public string material; public string[] clips; }
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
            if (!string.IsNullOrEmpty(item.material)) ApplyMaterial(instance, item.material);
            StandardizeMaterials(instance);
            if (item.kind == "character") AttachClips(instance, item.clips);
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
                    var tex = BaseTextureSlots.Where(src.HasProperty).Select(src.GetTexture).FirstOrDefault(t => t != null);
                    if (tex != null) { swap.SetTexture("_BaseMap", tex); swap.SetTexture("_MainTex", tex); }
                    var tint = src.HasProperty("_Color") ? src.GetColor("_Color") : Color.white;
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

    static void ApplyMaterial(GameObject instance, string path)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (mat == null) throw new FileNotFoundException(path);
        foreach (var r in instance.GetComponentsInChildren<Renderer>())
            r.sharedMaterials = Enumerable.Repeat(mat, r.sharedMaterials.Length).ToArray();
    }

    static void AttachClips(GameObject instance, string[] clipPaths)
    {
        AssetDatabase.CreateFolder("Assets", "__export_tmp");
        // Clips are all written before the controller exists: creating assets mid-way
        // reimports the folder and leaves earlier AnimatorState handles destroyed.
        var clipAssets = new List<string>();
        foreach (var path in clipPaths)
        {
            // FBX takes are often all named "Take 001"; a renamed copy keeps glTF animation names unique.
            var name = Path.GetFileNameWithoutExtension(path);
            var copy = UnityEngine.Object.Instantiate(LoadClip(path));
            copy.name = name;
            var copyPath = TempDir + "/" + name + ".anim";
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
