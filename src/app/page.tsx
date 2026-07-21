import { OfficeScene } from "@/components/office/OfficeScene";
import { CompanyHeader } from "@/components/office/CompanyHeader";
import { OfficeSceneInteractionLayer } from "@/components/office/OfficeSceneInteractionLayer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <CompanyHeader />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-6xl overflow-hidden rounded-xl border bg-white shadow-sm">
          <OfficeSceneInteractionLayer>
            <OfficeScene />
          </OfficeSceneInteractionLayer>
        </div>
      </main>
    </div>
  );
}
