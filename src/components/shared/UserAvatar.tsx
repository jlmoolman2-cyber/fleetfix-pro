type UserLike = {
  firstName?: string;
  lastName?: string;
  surname?: string;
  name?: string;
  displayName?: string;
  email?: string;
  colour?: string;
  color?: string;
  userColor?: string;
  profileColor?: string;
};

export function userDisplayName(user: UserLike | string | null | undefined) {
  if (typeof user === "string") return user.trim() || "User";
  if (!user) return "User";
  return String(
    user.name ||
    user.displayName ||
    `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim() ||
    user.email ||
    "User",
  ).trim();
}

export function userInitials(user: UserLike | string | null | undefined) {
  if (typeof user !== "string" && user) {
    const first = String(user.firstName || "").trim();
    const last = String(user.surname || user.lastName || "").trim();
    if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  const name = userDisplayName(user).replace(/@.*$/, "");
  const parts = name.split(/\s+/).filter(Boolean);
  return `${parts[0]?.charAt(0) || "U"}${parts.length > 1 ? parts.at(-1)?.charAt(0) || "" : ""}`.toUpperCase();
}

export default function UserAvatar({ user, size = "md", className = "" }: { user: UserLike | string; size?: "sm" | "md" | "lg"; className?: string }) {
  const name = userDisplayName(user);
  const colour = typeof user === "string" ? "#2563eb" : user.colour || user.color || user.userColor || user.profileColor || "#2563eb";
  const sizeClass = size === "sm" ? "h-7 w-7 text-[9px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-8 w-8 text-[10px]";
  return <span title={name} aria-label={name} className={`inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-white font-black uppercase text-white shadow-sm ${sizeClass} ${className}`} style={{ backgroundColor: colour }}>{userInitials(user)}</span>;
}
