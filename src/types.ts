export type TelegramPost = {
  message: string;
  telegramId: number;
  channelUsername: string;
};

export type Channel = {
  handle: string;
  name: string;
};

export type ChannelConfig = {
  channels: Channel[];
};
