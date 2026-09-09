import { ReactNode } from "react";

import { AppLayout } from "@/app/ui/layout/app-layout";
import { ProtectedRoute } from "@/app/ui/modules/auth/protected-route";
import { SessionBootstrap } from "@/app/ui/modules/auth/session-bootstrap";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <SessionBootstrap>
      <ProtectedRoute>
        <AppLayout>{children}</AppLayout>
      </ProtectedRoute>
    </SessionBootstrap>
  );
}
