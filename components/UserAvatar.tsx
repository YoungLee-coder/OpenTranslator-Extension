import { useEffect, useState } from "react";
import { initialsOf, loadAvatarBlobUrl } from "@/lib/avatar";
import { getAuth } from "@/lib/storage";
import type { AuthUser } from "@/types";

type UserAvatarProps = {
  user: AuthUser;
  baseUrl: string;
  className?: string;
};

export default function UserAvatar({ user, baseUrl, className }: UserAvatarProps) {
  const [avatarSrc, setAvatarSrc] = useState<string>();

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    void (async () => {
      const auth = await getAuth();
      if (!auth?.token || cancelled) return;
      objectUrl = await loadAvatarBlobUrl(baseUrl, auth.token, user.avatarUrl);
      if (!cancelled) setAvatarSrc(objectUrl);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baseUrl, user.avatarUrl]);

  const classNames = ["settings-avatar", className].filter(Boolean).join(" ");

  return (
    <span className={classNames}>
      {avatarSrc ? (
        <img className="settings-avatar-img" src={avatarSrc} alt={user.email} />
      ) : (
        <span className="settings-avatar-initials" aria-hidden>
          {initialsOf(user.email)}
        </span>
      )}
    </span>
  );
}
