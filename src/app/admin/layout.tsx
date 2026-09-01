import AdminActionBar from "./AdminActionBar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">
    <AdminActionBar />
    {children}
  </div>;
}
