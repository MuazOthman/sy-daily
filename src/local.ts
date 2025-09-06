import { config } from "dotenv";
config();

import { executeForLast24Hours } from "./executeForLast24Hours";

const simulate = false;

if (simulate) {
  console.log("Running in simulate mode");
}

executeForLast24Hours(simulate).then(() => {
  console.log("done");
});
