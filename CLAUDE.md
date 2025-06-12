# Slack AI Agent Demo

TypeScriptで実装されたSlack Bot + AWS CDKプロジェクト

## プロジェクト概要

- **フレームワーク**: Slack Bolt Framework (TypeScript)
- **インフラ**: AWS Lambda + API Gateway (CDK v2)
- **ランタイム**: Node.js v24
- **リージョン**: ap-northeast-1 (東京)
- **テスト**: Jest + TypeScript

## 機能

- Slack上で「hello」と送ったら「Hello, World!」と応答

## 開発環境セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env
# .envファイルにSlackトークンなどを設定

# TypeScriptコンパイル
npm run build

# テスト実行
npm test

# 開発中のテスト監視
npm run test:watch
```

## CDKデプロイ

```bash
# CDK Bootstrap（初回のみ）
npm run bootstrap

# スタックのデプロイ
npm run deploy

# 構文確認
npm run synth

# リソース削除
npm run destroy
```

## プロジェクト構造

```
slack-ai-agent-demo/
├── CLAUDE.md
├── src/
│   └── lambda/
│       ├── slack-handler.ts        # Slack Bot のメイン処理
│       └── __tests__/
│           └── slack-handler.test.ts
├── lib/
│   ├── slack-ai-agent-stack.ts     # CDK スタック定義
│   └── __tests__/
│       └── slack-ai-agent-stack.test.ts
├── bin/
│   └── slack-ai-agent.ts           # CDK アプリケーションエントリ
├── package.json
├── tsconfig.json
├── jest.config.js
├── cdk.json
├── .env.example
└── .gitignore
```

## 環境変数

以下の環境変数が必要です：

- `SLACK_BOT_TOKEN`: SlackアプリのBot User OAuth Token
- `SLACK_SIGNING_SECRET`: SlackアプリのSigning Secret
- `SLACK_APP_TOKEN`: SlackアプリのApp-Level Token
- `AWS_REGION`: AWSリージョン（ap-northeast-1）

## テスト

TDD（テスト駆動開発）アプローチを採用：

1. テストを先に書く
2. テストが失敗することを確認
3. 最小限のコードでテストを通す
4. リファクタリング

## コマンド

- `npm run build`: TypeScriptをコンパイル
- `npm run watch`: TypeScriptを監視モードでコンパイル
- `npm test`: テストを実行
- `npm run test:watch`: テストを監視モードで実行
- `npm run lint`: ESLintでコードチェック
- `npm run format`: Prettierでコード整形
- `npm run cdk`: CDKコマンドの実行
- `npm run deploy`: CDKでデプロイ
- `npm run destroy`: CDKでリソース削除
- `npm run bootstrap`: CDK初期化
- `npm run synth`: CDKテンプレート生成

## デプロイ

### CDK デプロイ

```bash
# CDK Bootstrap（初回のみ）
npm run bootstrap

# スタックのデプロイ
npm run deploy

# 構文確認
npm run synth

# リソース削除
npm run destroy
```

### 環境変数設定

```bash
# 環境変数ファイルの作成
cp .env.example .env

# 必要な値を設定
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
AWS_REGION=ap-northeast-1
```

### Slack アプリ設定

1. Slack アプリを作成
2. Bot Token Scopesに`chat:write`を追加
3. Event Subscriptionsを有効化
4. Request URLにAPI Gateway URLを設定
   - `https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/prod/slack/events`
5. Bot Eventsに`message.channels`を追加