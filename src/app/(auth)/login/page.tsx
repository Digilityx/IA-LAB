"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MailCheck } from "lucide-react"

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [isRegister, setIsRegister] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [error, setError] = useState(
    searchParams.get("error") === "auth"
      ? "La confirmation du compte a échoué. Veuillez réessayer."
      : ""
  )
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Purge tout état Supabase corrompu (session/refresh token périmé) qui
    // empêcherait un nouveau login. Safe car seuls les users NON connectés
    // arrivent sur cette page (le middleware redirige les sessions valides).
    try {
      const keys = Object.keys(localStorage)
      for (const k of keys) {
        if (k.startsWith("sb-")) localStorage.removeItem(k)
      }
    } catch {
      // localStorage peut être indisponible (SSR, mode privé strict) — on ignore
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    const supabase = createClient()

    if (isForgotPassword) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/reset-password`,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setSuccess("Un email de réinitialisation a été envoyé à " + email + ". Vérifiez votre boîte de réception.")
      setLoading(false)
      return
    }

    if (isRegister) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // Show confirmation message instead of redirecting
      setSuccess("Un email de confirmation a été envoyé à " + email + ". Vérifiez votre boîte de réception pour activer votre compte.")
      setLoading(false)
      return
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            IA
          </div>
          <CardTitle className="text-2xl">
            {isForgotPassword ? "Mot de passe oublié" : isRegister ? "Créer un compte" : "Connexion"}
          </CardTitle>
          <CardDescription>
            {isForgotPassword
              ? "Entrez votre email pour recevoir un lien de réinitialisation"
              : isRegister
              ? "Rejoignez IA Lab"
              : "Connectez-vous à IA Lab"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <MailCheck className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">{success}</p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setSuccess("")
                  setIsRegister(false)
                  setIsForgotPassword(false)
                }}
              >
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && !isForgotPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nom complet</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jean Dupont"
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jean@agence.com"
                    required
                  />
                </div>
                {!isForgotPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(true)
                          setError("")
                        }}
                        className="text-xs text-muted-foreground hover:text-primary hover:underline underline-offset-4"
                      >
                        Mot de passe oublié ?
                      </button>
                    )}
                  </div>
                )}
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? "Chargement..."
                    : isForgotPassword
                    ? "Envoyer le lien"
                    : isRegister
                    ? "Créer un compte"
                    : "Se connecter"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {isForgotPassword ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false)
                      setError("")
                    }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Retour à la connexion
                  </button>
                ) : (
                  <>
                    {isRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegister(!isRegister)
                        setError("")
                      }}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {isRegister ? "Se connecter" : "Créer un compte"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
