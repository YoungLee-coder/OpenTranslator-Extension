import { useEffect, useState } from "react";
import { initialsOf, loadAvatarBlobUrl } from "@/lib/avatar";
import { getAuth } from "@/lib/storage";
import { userLoginName, type AuthUser } from "@/types";

type UserAvatarProps = {
  user: AuthUser;
  baseUrl: string;
  className?: string;
};

export default function UserAvatar({ user, baseUrl, className }: UserAvatarProps) {
  const [avatarSrc, setAvatarSrc] = useState<string>();

  useEffect(() => {
    const abort = new AbortController();
    const objectUrlRef = { current: undefined as string | undefined };

    void (async () => {
      try {
        const auth = await getAuth();
        if (!auth?.token || abort.signal.aborted) return;
        const url = await loadAvatarBlobUrl(
          baseUrl,
          auth.token,
          user.avatarUrl,
          abort.signal,
        );
        if (!url) return;
        objectUrlRef.current = url;
        if (abort.signal.aborted) {
          URL.revokeObjectURL(url);
          objectUrlRef.current = undefined;
          return;
        }
        setAvatarSrc(url);
      } catch {
        // aborted or network — keep initials
      }
    })();

    return () => {
      abort.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [baseUrl, user.avatarUrl]);

  const displayName = userLoginName(user);
  const classNames = ["settings-avatar", className].filter(Boolean).join(" ");

  return (
    <span className={classNames}>
      {avatarSrc ? (
        <img className="settings-avatar-img" src={avatarSrc} alt={displayName} />
      ) : (
        <span className="settings-avatar-initials" aria-hidden>
          {initialsOf(displayName)}
        </span>
      )}
    </span>
  );
}
