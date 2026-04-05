"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth.store";

export default function LoginPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = React.useState("admin@mdm.local");
  const [password, setPassword] = React.useState("Admin123!");
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate login - no API needed
    await new Promise(r => setTimeout(r, 500));

    const fakeToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBtZG0ubG9jYWwiLCJvcmdJZCI6IjEiLCJwZXJtaXNzaW9ucyI6WyIqOioiXX0.demo";
    localStorage.setItem("auth_token", fakeToken);

    setUser(
      { id: "1", email, name: "System Admin", role: "org_admin" },
      fakeToken
    );

    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-xl">M</div>
          <CardTitle className="text-2xl">Sign in to MDM Console</CardTitle>
          <CardDescription>Enter your credentials to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
