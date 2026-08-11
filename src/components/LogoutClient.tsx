"use client";

import { useRouter } from "next/navigation";

export function LogoutClient() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn w-full justify-center"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
