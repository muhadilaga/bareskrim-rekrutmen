import { LoginForm } from "@/components/login/LoginForm";

export const metadata = { title: "Login - Rekrutmen Bareskrim PolriRbx [RI]" };

export default function LoginPage() {
  return (
    <div className="bg-hero-radial flex min-h-[70vh] flex-col items-center justify-center px-4 py-16">
      <div className="animate-scale-in w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}
