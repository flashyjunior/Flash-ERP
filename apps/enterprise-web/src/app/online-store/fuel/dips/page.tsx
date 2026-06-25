import { OnlineStoreFuelPage } from "../_fuel-page";

export const dynamic = "force-dynamic";

export default async function OnlineStoreFuelDipsPage() {
  return OnlineStoreFuelPage({
    defaultView: "dips",
    pageDescription: "Record station tank dips with mandatory photo evidence.",
    pageHeading: "Station Tank Dips"
  });
}
