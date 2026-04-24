import { Suspense } from "react";
import { EmployeePageClient } from "./EmployeePageClient";
import { Spinner } from "@/components/ui/spinner";

function EmployeeFallback() {
  return (
    <div
      className="flex min-h-svh w-full items-center justify-center bg-background"
      role="status"
      aria-label="Loading"
    >
      <Spinner className="size-12 text-primary" />
    </div>
  );
}

/** Single static route for Tauri/static export; employee UUID is in ?id= */
export default function EmployeePage() {
  return (
    <Suspense fallback={<EmployeeFallback />}>
      <EmployeePageClient />
    </Suspense>
  );
}
