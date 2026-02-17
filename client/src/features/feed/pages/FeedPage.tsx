import { useState } from "react";
import { PREFILL_FEED_TAB_KEY } from "../../../ui/navigation";
import { FeedEventsPage } from "./FeedEventsPage";
import { FeedersPage } from "./FeedersPage";
import { HayLotsPage } from "./HayLotsPage";
import { GrainLotsPage } from "./GrainLotsPage";

export function FeedPage() {
  const [tab, setTab] = useState<"events" | "feeders" | "hay" | "grain">(() => {
    try {
      const stored = localStorage.getItem(PREFILL_FEED_TAB_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_FEED_TAB_KEY);
      if (stored === "events" || stored === "feeders" || stored === "hay" || stored === "grain") return stored;
      return "events";
    } catch {
      return "events";
    }
  });

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Feed</h3>
          <p className="muted">Feed events, feeders, hay lots and grain lots. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button className={tab === "events" ? "btn btnPrimary" : "btn"} type="button" onClick={() => setTab("events")}>
            Events
          </button>
          <button className={tab === "feeders" ? "btn btnPrimary" : "btn"} type="button" onClick={() => setTab("feeders")}>
            Feeders
          </button>
          <button className={tab === "hay" ? "btn btnPrimary" : "btn"} type="button" onClick={() => setTab("hay")}>
            Hay lots
          </button>
          <button className={tab === "grain" ? "btn btnPrimary" : "btn"} type="button" onClick={() => setTab("grain")}>
            Grain lots
          </button>
        </div>
      </header>

      <div className="hr" />

      {tab === "events" ? <FeedEventsPage /> : null}
      {tab === "feeders" ? <FeedersPage /> : null}
      {tab === "hay" ? <HayLotsPage /> : null}
      {tab === "grain" ? <GrainLotsPage /> : null}
    </section>
  );
}
