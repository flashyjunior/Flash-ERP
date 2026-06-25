import { OnlineStoreFuelPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelTanksPage() {
  return OnlineStoreFuelPage({
    defaultView: "tanks",
    pageDescription: "Maintain station fuel tanks, products, capacities, and book quantities.",
    pageHeading: "Station Fuel Tanks"
  });
}
