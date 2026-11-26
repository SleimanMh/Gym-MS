import { GymLeadForm } from "./gym-lead-form";
import { GymSchedule } from "./gym-schedule";

// Safe to load twice on one page (e.g. CMS includes the script in two blocks).
if (!customElements.get("gym-schedule")) customElements.define("gym-schedule", GymSchedule);
if (!customElements.get("gym-lead-form")) customElements.define("gym-lead-form", GymLeadForm);

export { GymLeadForm, GymSchedule };
