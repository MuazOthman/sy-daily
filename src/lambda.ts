import { ScheduledHandler } from "aws-lambda";
import { executeForLast24Hours } from "./executeForLast24Hours";

export const handler: ScheduledHandler = async (event) => {
  console.log("Received scheduled event:", JSON.stringify(event));
  try {
    console.log("Executing scheduled task...");
    await executeForLast24Hours();
    console.log("Execution completed successfully");
  } catch (error) {
    console.error("Error executing scheduled task:", error);
    throw error;
  }
};
