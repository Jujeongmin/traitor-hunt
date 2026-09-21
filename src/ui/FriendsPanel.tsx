import { useState, type FormEvent } from "react";
import type { FriendEntry, FriendsView } from "../game/account/friends";
import { PARTY_MAX, type PartyView } from "../game/account/party";
import { friendProblem, sortFriends, type FriendsClient } from "../net/friends";
import { partyProblem, type PartyClient } from "../net/party";

interface FriendsPanelProps {
  onClose: () => void;
  // Null while offline: friends live on the game server.
  client: FriendsClient | null;
  view: FriendsView | null;
  account: string;
  party: PartyClient | null;
  partyView: PartyView | null;
  // Friends find each other by nickname, so adding one needs yours first.
  // Friends find you by your character's name, so adding them waits for a character.
  hasCharacter: boolean;
}

function nameOf(entry: FriendEntry): string {
  return entry.nickname ?? "(이름 없음)";
}

// Right-hand side drawer: add a friend by nickname, answer requests, see who is online.
export function FriendsPanel({
  onClose, client, view, account, party, partyView, hasCharacter,
}: FriendsPanelProps) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // One action at a time; `key` marks which button is working.
  const run = async (key: string, action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice(key.startsWith("party:") ? partyProblem(error) : friendProblem(error));
    } finally {
      setBusy(null);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!client || query.trim() === "") return;
    void run("add", async () => {
      const status = await client.request(query.trim());
      setQuery("");
      return status === "accepted" ? "서로 요청해서 바로 친구가 되었어요" : "친구 요청을 보냈어요";
    });
  };

  const remove = (entry: FriendEntry) => {
    if (!client) return;
    if (confirming !== entry.account) {
      setConfirming(entry.account);
      return;
    }
    setConfirming(null);
    void run(entry.account, async () => {
      await client.remove(entry.account);
      return null;
    });
  };

  const friends = view ? sortFriends(view.friends) : [];
  const onlineCount = friends.filter((f) => f.online).length;
  const members = partyView?.party?.members ?? [];
  const leading = partyView?.party?.leader === account;
  const canInvite = (entry: FriendEntry) =>
    !!party && entry.online && members.length < PARTY_MAX && !members.some((m) => m.account === entry.account);

  const inviteFriend = (entry: FriendEntry) =>
    void run(`party:${entry.account}`, async () => {
      await party!.invite(entry.account);
      return `${nameOf(entry)}님에게 파티 초대를 보냈어요`;
    });

  return (
    <aside className="friends-panel">
      <header>
        <h2>친구</h2>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </header>
      {client && !hasCharacter && <p className="note">친구를 추가하려면 먼저 캐릭터를 만드세요.</p>}
      <form className="friend-add" onSubmit={add}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="닉네임으로 친구 추가"
          disabled={!client || !hasCharacter}
        />
        <button type="submit" className="text-button" disabled={!client || !hasCharacter || busy !== null || query.trim() === ""}>추가</button>
      </form>
      {notice && <p className="friend-notice">{notice}</p>}

      {!client && <p className="note">친구와 파티는 Verse8 서버를 연결한 뒤 열립니다.</p>}
      {client && !view && <p className="note">친구 목록을 불러오는 중…</p>}

      {partyView?.party && (
        <>
          <h3>파티 {members.length}/{PARTY_MAX}</h3>
          <ul className="friend-list">
            {members.map((m) => (
              <li key={m.account} className={m.online ? "online" : "offline"}>
                <span className="presence" />
                <span className="friend-name">
                  {m.nickname ?? m.account}
                  {m.account === partyView.party!.leader && <span className="party-leader">파티장</span>}
                </span>
                {leading && m.account !== account && (
                  <button type="button" className="text-button" disabled={busy !== null}
                    onClick={() => void run(`party:${m.account}`, async () => {
                      await party!.kick(m.account);
                      return null;
                    })}>내보내기</button>
                )}
              </li>
            ))}
          </ul>
          <div className="party-actions">
            <button type="button" className="text-button" disabled={busy !== null}
              onClick={() => void run("party:leave", async () => {
                await party!.leave();
                return "파티에서 나왔어요";
              })}>파티 나가기</button>
          </div>
        </>
      )}

      {view && view.incoming.length > 0 && (
        <>
          <h3>받은 요청 {view.incoming.length}</h3>
          <ul className="friend-list">
            {view.incoming.map((entry) => (
              <li key={entry.account}>
                <span className="friend-name">{nameOf(entry)}</span>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.accept(entry.account);
                    return `${nameOf(entry)}님과 친구가 되었어요`;
                  })}>수락</button>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.remove(entry.account);
                    return null;
                  })}>거절</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view && (
        <>
          <h3>친구 목록 {friends.length > 0 && `· 온라인 ${onlineCount}/${friends.length}`}</h3>
          {friends.length === 0 && <p className="note">아직 친구가 없습니다. 닉네임으로 추가해 보세요.</p>}
          <ul className="friend-list">
            {friends.map((entry) => (
              <li key={entry.account} className={entry.online ? "online" : "offline"}>
                <span className="presence" aria-label={entry.online ? "온라인" : "오프라인"} />
                <span className="friend-name">{nameOf(entry)}</span>
                {canInvite(entry) && (
                  <button type="button" className="text-button" disabled={busy !== null} onClick={() => inviteFriend(entry)}>
                    초대
                  </button>
                )}
                <button type="button" className="text-button" disabled={busy !== null} onClick={() => remove(entry)}>
                  {confirming === entry.account ? "정말 삭제" : "삭제"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view && view.outgoing.length > 0 && (
        <>
          <h3>보낸 요청</h3>
          <ul className="friend-list">
            {view.outgoing.map((entry) => (
              <li key={entry.account}>
                <span className="friend-name">{nameOf(entry)}</span>
                <span className="friend-status">대기 중</span>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.remove(entry.account);
                    return null;
                  })}>취소</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
