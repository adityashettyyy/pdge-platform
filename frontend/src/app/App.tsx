import { useState } from "react";
import { LandingPage } from "./components/landing-page";
import { Sidebar } from "./components/sidebar";
import { Header } from "./components/header";
import { Dashboard } from "./components/dashboard";
import { LiveMap } from "./components/live-map";
import { ReportDisaster } from "./components/report-disaster";
import { ResourceManagement } from "./components/resource-management";
import { Analytics } from "./components/analytics";
import { Settings } from "./components/settings";

export default function App() {
  const [currentPage, setCurrentPage] = useState("landing");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [systemStatus, setSystemStatus] = useState<"normal" | "critical">("normal");

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    
    // Simulate critical status when viewing certain pages
    if (page === "dashboard" || page === "map") {
      // Randomly set critical status for demonstration
      setSystemStatus(Math.random() > 0.7 ? "critical" : "normal");
    }
  };

  if (currentPage === "landing") {
    return <LandingPage onNavigate={handleNavigate} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] flex">
      {/* Sidebar */}
      <Sidebar
        activePage={currentPage}
        onNavigate={handleNavigate}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Header */}
        <Header systemStatus={systemStatus} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#0B0F1A] via-[#0f1419] to-[#111827]">
          {currentPage === "dashboard" && <Dashboard />}
          {currentPage === "map" && <LiveMap />}
          {currentPage === "report" && <ReportDisaster />}
          {currentPage === "resources" && <ResourceManagement />}
          {currentPage === "analytics" && <Analytics />}
          {currentPage === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}