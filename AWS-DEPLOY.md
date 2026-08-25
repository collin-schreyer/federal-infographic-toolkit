# AWS Deployment — Federal Infographic Toolkit

Production runs on AWS in `us-east-1`, account `637423570632`, CloudFormation
stack **`fit-prod`**.

| | |
|---|---|
| **Live URL** | https://13-219-66-240.sslip.io |
| **Instance** | `i-0f66cbf26dd97a634` (t4g.small, ARM, 2 GB) |
| **Elastic IP** | `13.219.66.240` |
| **Data volume** | `vol-000e2a2334b1255e6` (20 GB gp3, mounted `/data`) |
| **Repo** | https://github.com/collin-schreyer/federal-infographic-toolkit-v2 (branch `main`) |
| **Cost** | ~$14/month (instance ~$12.26, EBS ~$1.60, EIP free while attached) |

---

## Deploying

From a checkout of `main`, with AWS credentials configured:

```bash
./deploy/aws/deploy.sh
```

That pulls `main` onto the server, refreshes secrets, rebuilds the container,
restarts, and health-checks the live site. Takes 2–4 minutes. There is no
second step — no separate frontend deploy, no CDN invalidation.

Other day-to-day commands:

```bash
./deploy/aws/logs.sh              # last 100 lines of app logs
./deploy/aws/logs.sh caddy        # web/TLS layer instead
./deploy/aws/logs.sh app 500      # more lines

aws ssm start-session --target i-0f66cbf26dd97a634 --region us-east-1   # shell
```

---

## How it is put together

One EC2 instance runs two containers via Docker Compose:

- **caddy** — terminates TLS, proxies to the app. Gets Let's Encrypt
  certificates automatically and renews them without intervention.
- **app** — the toolkit. Same `Dockerfile` that ran on Fly; nothing about the
  application changed in the move.

**Data lives on a separate EBS volume mounted at `/data`** — `app.db` (SQLite:
users, projects, render metadata) and `uploads/` (every generated image). It is
a distinct volume from the instance's root disk on purpose: the instance can be
rebuilt, resized, or replaced and the data survives. Deleting the stack
snapshots the volume rather than destroying it.

**Secrets live in SSM Parameter Store** as encrypted SecureStrings, never in
git and never baked into the image:

| Parameter | What |
|---|---|
| `/fit/openai-api-key` | OpenAI (gpt-image-2 + GPT-5) |
| `/fit/gemini-api-key` | Google (Nano Banana) |
| `/fit/github-deploy-key` | Read-only SSH key the server uses to pull the repo |
| `/fit/admin-email` | Seeds the first admin on an empty database |
| `/fit/app-hostname` | Optional — set to use a real domain (see below) |

Rotate one and redeploy:

```bash
aws ssm put-parameter --name /fit/openai-api-key --value "sk-proj-..." \
  --type SecureString --overwrite --region us-east-1
./deploy/aws/deploy.sh
```

**There is no SSH port and no key pair.** Shell access goes through AWS SSM
Session Manager, which is gated by IAM — access is granted and revoked by
changing an IAM policy, not by distributing keys. The security group opens only
80 and 443.

---

## The URL, and moving to a real domain

The default hostname is `13-219-66-240.sslip.io`. `sslip.io` is a public DNS
service that resolves any `<dashed-ip>.sslip.io` name to that IP, which lets
Caddy pass the Let's Encrypt challenge and serve real HTTPS without owning a
domain. It works, but it is not a great address to hand to colleagues.

**Recommended:** point a real hostname (e.g. `tools.bna-inc.com`) at
`13.219.66.240` with an A record, then:

```bash
aws ssm put-parameter --name /fit/app-hostname --value tools.bna-inc.com \
  --type String --overwrite --region us-east-1
./deploy/aws/deploy.sh
```

Caddy issues a certificate for the new name on restart. Do this before
publicising the tool widely — the sslip.io address changes if the Elastic IP
ever does.

---

## Backups

The data volume is not automatically backed up beyond the snapshot taken on
stack deletion. Take one before anything risky:

```bash
aws ec2 create-snapshot --volume-id vol-000e2a2334b1255e6 \
  --description "fit manual $(date -u +%F)" --region us-east-1
```

Worth scheduling: AWS Backup or a daily EventBridge rule against that volume.
Everything the team has produced lives on it.

---

## Migrating data from Fly again

The Fly deployment still exists and can be re-copied at any time until it is
destroyed:

```bash
./deploy/aws/migrate-from-fly.sh
```

It checkpoints the SQLite WAL on Fly, tars `/data`, stages through S3, and
restores onto the EBS volume — keeping a timestamped `app.db.pre-migration-*`
copy first. Anything created on Fly after a run is not on AWS until it is run
again.

---

## Rebuilding from nothing

If the stack is ever deleted, this recreates it:

```bash
aws cloudformation deploy \
  --stack-name fit-prod \
  --template-file deploy/aws/cloudformation.yml \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    VpcId=vpc-08f1fcf96c940736f \
    SubnetId=subnet-07d10712d2e65c65c \
    InstanceType=t4g.small \
    DataVolumeSizeGb=20
```

Then restore data from the most recent EBS snapshot or re-run the Fly
migration, and `./deploy/aws/deploy.sh`.

---

## Troubleshooting

**502 from the site.** The app container is down or restarting. `./deploy/aws/logs.sh`
will usually say why; `./deploy/aws/deploy.sh` rebuilds and restarts.

**Renders fail with a 502 from `/api/render`.** Almost always an upstream API
key problem — expired key, or exhausted quota/billing on the OpenAI or Google
project. The error text from the provider is passed through to the browser and
into the logs.

**Build fails with "compose build requires buildx".** The Docker buildx plugin
is missing on the host — it is installed by the bootstrap script, but if the
instance was rebuilt from an older template, install it manually (see the
UserData section of `cloudformation.yml`).

**Certificate errors after changing the hostname.** Caddy needs the DNS record
to resolve to this server *before* it can issue a certificate. Confirm with
`dig +short <hostname>` then redeploy.
