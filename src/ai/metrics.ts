import { ProviderConfig } from "./getLLMProvider";

export interface ProviderMetrics {
  providerUsed: ProviderConfig;
  attemptsMade: number;
  operationName: string;
  success: boolean;
  durationMs?: number;
}

/**
 * Send provider usage metrics to CloudWatch using Embedded Metric Format (EMF)
 * This logs metrics in a special JSON format that CloudWatch Logs automatically converts to metrics
 */
export function recordProviderMetrics(metrics: ProviderMetrics): void {
  // Only send metrics if running in Lambda
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log(`📊 [Metrics] ${JSON.stringify(metrics)}`);
    return;
  }

  try {
    const namespace = "SyDaily/AIProviders";

    // CloudWatch Embedded Metric Format (EMF)
    // See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
    const emfLog = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: namespace,
            Dimensions: [
              ["Provider", "Model", "Operation"],
              ["Provider", "Operation"],
              ["Operation"],
            ],
            Metrics: [
              { Name: "ProviderSuccess", Unit: "Count" },
              { Name: "AttemptCount", Unit: "Count" },
              ...(metrics.durationMs !== undefined
                ? [{ Name: "OperationDuration", Unit: "Milliseconds" }]
                : []),
            ],
          },
        ],
      },
      Provider: metrics.providerUsed.provider,
      Model: metrics.providerUsed.model,
      Operation: metrics.operationName,
      ProviderSuccess: metrics.success ? 1 : 0,
      AttemptCount: metrics.attemptsMade,
      ...(metrics.durationMs !== undefined
        ? { OperationDuration: metrics.durationMs }
        : {}),
    };

    // Log the EMF-formatted JSON to stdout
    // CloudWatch Logs will automatically parse this and create metrics
    console.log(JSON.stringify(emfLog));

    console.log(
      `📊 [CloudWatch EMF] Recorded metrics for ${metrics.providerUsed.provider}:${metrics.providerUsed.model}`
    );
  } catch (error) {
    // Don't fail the operation if metrics recording fails
    console.error("Failed to record CloudWatch metrics:", error);
  }
}