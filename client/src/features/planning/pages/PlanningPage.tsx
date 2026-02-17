import { useState } from "react";
import { CropSeasonsPage } from "./CropSeasonsPage";
import { PaddockPlansPage } from "./PaddockPlansPage";
import { ProductionPlansPage } from "./ProductionPlansPage";

export function PlanningPage() {
  const [tab, setTab] = useState<"cropSeasons" | "paddockPlans" | "productionPlans">("cropSeasons");

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Planning</h3>
          <p className="muted">Crop seasons, paddock plans, and production plans. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button
            className={tab === "cropSeasons" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setTab("cropSeasons")}
          >
            Crop Seasons
          </button>
          <button
            className={tab === "paddockPlans" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setTab("paddockPlans")}
          >
            Paddock Plans
          </button>
          <button
            className={tab === "productionPlans" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setTab("productionPlans")}
          >
            Production
          </button>
        </div>
      </header>

      <div className="hr" />

      {tab === "cropSeasons" ? <CropSeasonsPage /> : null}
      {tab === "paddockPlans" ? <PaddockPlansPage /> : null}
      {tab === "productionPlans" ? <ProductionPlansPage /> : null}
    </section>
  );
}
