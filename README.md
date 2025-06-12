# Slack AI Agent Demo

TypeScript + AWS CDK + Slack Bolt を使用したSlack Botのデモプロジェクト

## 概要

- **目的**: デモンストレーション用Slack Bot
- **機能**: "hello" メッセージに "Hello, World!" で応答
- **技術スタック**: TypeScript, AWS Lambda, API Gateway, Slack Bolt Framework
- **開発手法**: TDD (テスト駆動開発)

## クイックスタート

```bash
# 1. クローン
git clone <this-repository>
cd slack-ai-agent-demo

# 2. 依存関係インストール
npm install

# 3. テスト実行
npm test

# 4. ビルド
npm run build

# 5. デプロイ
npm run deploy
```

詳細は `CLAUDE.md` を参照してください。

## 必要な環境変数

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
AWS_REGION=ap-northeast-1
```

## ディレクトリ構造

```
slack-ai-agent-demo/
├── src/lambda/              # Lambda 関数
├── lib/                     # CDK スタック定義
├── bin/                     # CDK アプリエントリ
└── CLAUDE.md               # 詳細な開発・デプロイ手順
```

## ライセンス

MIT