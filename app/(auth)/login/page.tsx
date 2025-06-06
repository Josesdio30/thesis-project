"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ user_name: userName, password }),
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("userName", data.user.name);
      router.push("/dashboard");
    } else {
      const err = await res.json();
      setErrorMsg(err.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Image
            src="/st_louis-2.png"
            alt="SMA St. Louis Surabaya Logo"
            width={150}
            height={150}
            className="object-contain"
          />
        </div>
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <Input
              type="text"
              placeholder="Username"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>
          <div>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {errorMsg && (
            <div className="text-red-500 text-sm">{errorMsg}</div>
          )}
          <Button type="submit" className="w-full bg-orange-400 hover:bg-orange-600 text-white rounded-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
