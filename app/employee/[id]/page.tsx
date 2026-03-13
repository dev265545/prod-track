import { EmployeePageClient } from "./EmployeePageClient";

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function EmployeePage() {
  return <EmployeePageClient />;
}
