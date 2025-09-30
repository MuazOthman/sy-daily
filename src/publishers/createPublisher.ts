import { AbstractPublisher } from "./AbstractPublisher";
import { TelegramUser } from "../telegram/user";
import { FacebookPage } from "../facebook/facebookPage";
import { SupportedPublishChannel } from "../types";

export function createPublisher(
  channel: SupportedPublishChannel
): AbstractPublisher {
  switch (channel) {
    case "telegram":
      return new TelegramUser();

    case "facebook":
      return new FacebookPage();

    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}