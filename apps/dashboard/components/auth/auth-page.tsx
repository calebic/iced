"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AuthTab = "login" | "register";

type AuthPageProps = {
  initialTab?: AuthTab;
};

const AuthPage = ({ initialTab = "login" }: AuthPageProps) => {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [username, setUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/dashboard/apps", {
          credentials: "include",
        });

        if (response.ok) {
          router.replace("/dashboard/home");
          return;
        }
      } catch {
        // Ignore session check errors and allow auth form to render.
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, [router]);

  const validateLogin = () => {
    if (!loginEmail.includes("@")) {
      return "Please enter a valid email address.";
    }

    if (loginPassword.length < 8) {
      return "Password must be at least 8 characters.";
    }

    return "";
  };

  const validateRegister = () => {
    if (!username.trim()) {
      return "Please enter a username.";
    }

    if (!registerEmail.includes("@")) {
      return "Please enter a valid email address.";
    }

    if (registerPassword.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (registerPassword !== confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateLogin();
    if (validationError) {
      setLoginError(validationError);
      return;
    }

    setLoginError("");
    setIsLoggingIn(true);

    try {
      const response = await fetch("/dashboard/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!response.ok) {
        setLoginError("Login failed. Please check your credentials and try again.");
        return;
      }

      router.push("/dashboard/home");
    } catch {
      setLoginError("Unable to sign in right now. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateRegister();
    if (validationError) {
      setRegisterError(validationError);
      return;
    }

    setRegisterError("");
    setIsRegistering(true);

    try {
      const response = await fetch("/dashboard/auth/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          email: registerEmail,
          password: registerPassword,
        }),
      });

      if (!response.ok) {
        setRegisterError("Registration failed. Please review your details and try again.");
        return;
      }

      router.push("/dashboard/home");
    } catch {
      setRegisterError("Unable to create your account right now. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-md items-center justify-center">
        <p className="text-sm text-slate-300">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-md items-center">
      <Card className="w-full">
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <CardTitle>Welcome to Iced</CardTitle>
            <CardDescription>Sign in or create a dashboard account to continue.</CardDescription>
          </div>
          <div className="grid grid-cols-2 rounded-lg bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={cn(
                "h-10 rounded-md text-sm font-semibold transition",
                tab === "login"
                  ? "bg-white text-slate-900"
                  : "text-slate-300 hover:text-white",
              )}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={cn(
                "h-10 rounded-md text-sm font-semibold transition",
                tab === "register"
                  ? "bg-white text-slate-900"
                  : "text-slate-300 hover:text-white",
              )}
            >
              Register
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {tab === "login" ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  name="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  name="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
                {loginError}
              </div>
              <Button type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleRegister}>
              <div className="space-y-2">
                <Label htmlFor="register-username">Username</Label>
                <Input
                  id="register-username"
                  name="register-username"
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  name="register-email"
                  type="email"
                  placeholder="you@example.com"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  name="register-password"
                  type="password"
                  placeholder="Create a password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-confirm">Confirm password</Label>
                <Input
                  id="register-confirm"
                  name="register-confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="min-h-[1.5rem] text-sm text-rose-400" role="alert">
                {registerError}
              </div>
              <Button type="submit" disabled={isRegistering}>
                {isRegistering ? "Creating account…" : "Create account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
