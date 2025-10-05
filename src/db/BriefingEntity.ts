import {
  Entity,
  FormattedItem,
  GetItemCommand,
  item,
  list,
  map,
  number,
  PutItemCommand,
  string,
  UpdateItemCommand,
  $prepend,
  $set,
} from "dynamodb-toolbox";
import { StateTable } from "./Table";
import {
  AvailableFormatter,
  AvailableFormatters,
  ContentLanguage,
  ContentLanguages,
} from "../types";

export const UsageSchema = map({
  inputTokens: number(),
  outputTokens: number(),
  totalTokens: number(),
});

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export const BriefingEntity = new Entity({
  name: "Briefing",
  table: StateTable,
  schema: item({
    date: string().key(),
    collectedTime: string().optional(),
    deduplicatedTime: string().optional(),
    deduplicatedUsage: UsageSchema.optional(),
    summarizedTime: string().optional(),
    summarizedUsage: UsageSchema.optional(),
    publishedToWebsiteTime: string().optional(),
    posts: list(
      map({
        platform: string().enum(...AvailableFormatters),
        language: string().enum(...ContentLanguages),
        url: string(),
      })
    ).optional(),
  }),
  computeKey: ({ date }) => ({
    PK: `BRIEFING#${date}`,
    SK: "META",
  }),
  timestamps: true,
});

export type Briefing = FormattedItem<typeof BriefingEntity>;

export async function getBriefing(date: string) {
  const { Item: briefing } = await BriefingEntity.build(GetItemCommand)
    .key({ date })
    .send();
  return briefing;
}

export type BriefingWriteOperationParamsBase = {
  date: string;
  overwrite?: boolean;
};

export type BriefingWriteOperationParamsCollectedTime =
  BriefingWriteOperationParamsBase & {
    collectedTime: string | Date;
  };

export type BriefingWriteOperationParamsDeduplicated =
  BriefingWriteOperationParamsBase & {
    deduplicatedTime: string | Date;
    deduplicatedUsage: Usage;
  };

export type BriefingWriteOperationParamsSummarizedTime =
  BriefingWriteOperationParamsBase & {
    summarizedTime: string | Date;
    summarizedUsage: Usage;
  };

export type BriefingWriteOperationParamsPublishedToWebsiteTime =
  BriefingWriteOperationParamsBase & {
    publishedToWebsiteTime: string | Date;
  };

export type BriefingWriteOperationParamsPost =
  BriefingWriteOperationParamsBase & {
    formatter: AvailableFormatter;
    language: ContentLanguage;
    postUrl: string;
  };

export async function initializeBriefing({
  date,
  overwrite,
}: BriefingWriteOperationParamsBase): Promise<Briefing> {
  const currentBriefing = await getBriefing(date);
  if (currentBriefing && !overwrite) {
    throw new Error(`Briefing ${date} already exists`);
  }
  const briefing = await BriefingEntity.build(PutItemCommand)
    .item({ date })
    .send();
  return briefing.ToolboxItem;
}

export async function updateBriefingCollectedTime({
  date,
  collectedTime,
  overwrite,
}: BriefingWriteOperationParamsCollectedTime) {
  const currentBriefing = await getBriefing(date);
  if (!currentBriefing) {
    throw new Error(`Briefing ${date} not found`);
  }
  if (currentBriefing.collectedTime !== undefined && !overwrite) {
    throw new Error(`Briefing ${date} already collected`);
  }
  const time =
    typeof collectedTime === "string"
      ? collectedTime
      : collectedTime.toISOString();
  await BriefingEntity.build(UpdateItemCommand)
    .item({
      date,
      collectedTime: time,
    })
    .send();
}

export async function updateBriefingDeduplicated({
  date,
  deduplicatedTime,
  deduplicatedUsage,
  overwrite,
}: BriefingWriteOperationParamsDeduplicated) {
  const currentBriefing = await getBriefing(date);
  console.log(
    JSON.stringify(
      {
        operation: "updateBriefingDeduplicated",
        args: {
          date,
          deduplicatedTime,
          deduplicatedUsage,
          overwrite,
        },
        currentBriefing,
      },
      null,
      2
    )
  );
  if (!currentBriefing) {
    throw new Error(`Briefing ${date} not found`);
  }
  if (currentBriefing.collectedTime === undefined) {
    throw new Error(`Briefing ${date} not collected`);
  }
  if (currentBriefing.deduplicatedTime !== undefined && !overwrite) {
    throw new Error(`Briefing ${date} already deduplicated`);
  }
  const time =
    typeof deduplicatedTime === "string"
      ? deduplicatedTime
      : deduplicatedTime.toISOString();

  await BriefingEntity.build(UpdateItemCommand)
    .item({
      date,
      deduplicatedTime: time,
      deduplicatedUsage: $set(deduplicatedUsage),
    })
    .send();
}

export async function updateBriefingSummarizedTime({
  date,
  summarizedTime,
  summarizedUsage,
  overwrite,
}: BriefingWriteOperationParamsSummarizedTime) {
  const currentBriefing = await getBriefing(date);
  console.log(
    JSON.stringify(
      {
        operation: "updateBriefingSummarizedTime",
        args: {
          date,
          summarizedTime,
          summarizedUsage,
          overwrite,
        },
        currentBriefing,
      },
      null,
      2
    )
  );
  if (!currentBriefing) {
    throw new Error(`Briefing ${date} not found`);
  }
  if (currentBriefing.deduplicatedTime === undefined) {
    throw new Error(`Briefing ${date} not deduplicated`);
  }
  if (currentBriefing.summarizedTime !== undefined && !overwrite) {
    throw new Error(`Briefing ${date} already summarized`);
  }
  const time =
    typeof summarizedTime === "string"
      ? summarizedTime
      : summarizedTime.toISOString();

  await BriefingEntity.build(UpdateItemCommand)
    .item({
      date,
      summarizedTime: time,
      summarizedUsage: $set(summarizedUsage),
    })
    .send();
}

export async function updateBriefingPublishedToWebsiteTime({
  date,
  publishedToWebsiteTime,
  overwrite,
}: BriefingWriteOperationParamsPublishedToWebsiteTime) {
  const currentBriefing = await getBriefing(date);
  console.log(
    JSON.stringify(
      {
        operation: "updateBriefingPublishedToWebsiteTime",
        args: {
          date,
          publishedToWebsiteTime,
          overwrite,
        },
        currentBriefing,
      },
      null,
      2
    )
  );
  if (!currentBriefing) {
    throw new Error(`Briefing ${date} not found`);
  }
  if (currentBriefing.summarizedTime === undefined) {
    throw new Error(`Briefing ${date} not summarized`);
  }
  if (currentBriefing.publishedToWebsiteTime !== undefined && !overwrite) {
    throw new Error(`Briefing ${date} already published to website`);
  }
  const time =
    typeof publishedToWebsiteTime === "string"
      ? publishedToWebsiteTime
      : publishedToWebsiteTime.toISOString();
  await BriefingEntity.build(UpdateItemCommand)
    .item({ date, publishedToWebsiteTime: time })
    .send();
}

export async function updateBriefingPost({
  date,
  formatter,
  language,
  postUrl,
  overwrite,
}: BriefingWriteOperationParamsPost) {
  const currentBriefing = await getBriefing(date);
  console.log(
    JSON.stringify(
      {
        operation: "updateBriefingPost",
        args: {
          date,
          formatter,
          language,
          postUrl,
          overwrite,
        },
        currentBriefing,
      },
      null,
      2
    )
  );
  if (!currentBriefing) {
    throw new Error(`Briefing ${date} not found`);
  }
  if (currentBriefing.publishedToWebsiteTime === undefined) {
    throw new Error(`Briefing ${date} not published to website`);
  }
  const posts = currentBriefing.posts ?? [];
  const post = posts.find(
    (post) => post.platform === formatter && post.language === language
  );
  if (post !== undefined && !overwrite) {
    throw new Error(
      `Briefing ${date} already has a post for ${formatter} in ${language}, URL: ${post.url}`
    );
  }

  await BriefingEntity.build(UpdateItemCommand)
    .item({
      date,
      posts: $prepend([{ platform: formatter, language, url: postUrl }]),
    })
    .send();
}
