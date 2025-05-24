import { config } from "dotenv";
config();

import { executeForLast24Hours } from "./executeForLast24Hours";

executeForLast24Hours().then(() => {
  console.log("done");
});
