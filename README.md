# GitLab CI/CD Pipeline for Deploying a Node.js Application

## Introduction

### What is a GitLab Runner?
A GitLab Runner is an application that executes CI/CD jobs in GitLab pipelines. It picks up jobs defined in the `.gitlab-ci.yml` file and runs them on a specified environment. Runners can be shared across projects or dedicated to a single repository.

### What is a Public Runner?
A public runner is a shared runner provided by GitLab that can execute jobs for multiple repositories. These runners are useful for users who do not want to set up a self-hosted runner. Public runners use GitLab's infrastructure and are available to all projects unless explicitly disabled.

### Configuring the Pipeline for a Tagless Runner
By default, GitLab requires jobs to specify tags that match the runner's configured tags. However, to use a tagless runner (such as a public runner), ensure that no `tags:` field is specified in the `.gitlab-ci.yml` file. This allows GitLab's shared runners to execute the pipeline automatically.

## Prerequisites

- A GitLab repository with your Node.js application.
- A `.gitlab-ci.yml` file in the root of your repository.
- A GitLab public runner enabled for your project.

## `.gitlab-ci.yml` Configuration

Create a `.gitlab-ci.yml` file in the root of your project with the following content:

```yaml
stages:
  - install
  - test
  - build
  - deploy

variables:
  IMAGE_NAME: "ram0810/node-app"  # Ensure correct format
  EC2_USER: ubuntu
  EC2_HOST: $EC2_PUBLIC_IP  # Replace with your EC2 Public IP
  SSH_PRIVATE_KEY: $EC2_SSH_PRIVATE_KEY  # Stored as a GitLab CI/CD secret variable
  DOCKER_HUB_USERNAME: $DOCKER_HUB_USERNAME
  DOCKER_HUB_PASSWORD: $DOCKER_HUB_PASSWORD
  DEPLOY_DIR: "/home/ubuntu/node-app"

image: node:16

services:
  - docker:20.10.7-dind

install_dependencies:
  stage: install
  script:
    - echo "Installing Node.js dependencies..."
    - npm install
  cache:
    paths:
      - node_modules/

run_tests:
  stage: test
  script:
    - echo "Running tests..."
    - npm install --save-dev mocha
    - npm test
  rules:
    - if: '$CI_COMMIT_BRANCH != "master"'

build_and_push_image:
  stage: build
  image: docker:20.10.7
  script:
    - echo "$DOCKER_HUB_PASSWORD" | docker login -u "$DOCKER_HUB_USERNAME" --password-stdin
    - docker build -t "$IMAGE_NAME:$CI_COMMIT_SHA" .
    - docker push "$IMAGE_NAME:$CI_COMMIT_SHA"
    - docker tag "$IMAGE_NAME:$CI_COMMIT_SHA" "$IMAGE_NAME:latest"
    - docker push "$IMAGE_NAME:latest"

deploy_on_ec2:
  stage: deploy
  before_script:
    - mkdir -p ~/.ssh
    - echo "$EC2_PEM_KEY" > ~/.ssh/ec2_key.pem
    - chmod 600 ~/.ssh/ec2_key.pem
    - ssh-keyscan -H $EC2_HOST >> ~/.ssh/known_hosts
  script:
    - echo "Deploying application on EC2 using SSH..."
    - |
      ssh -i ~/.ssh/ec2_key.pem $EC2_USER@$EC2_HOST << 'EOF'
        set -e
        echo "Ensuring Docker & Docker Compose are installed..."
        if ! command -v docker &> /dev/null; then
          echo "Installing Docker..."
          sudo apt-get update
          sudo apt-get install -y docker.io
          sudo usermod -aG docker $USER
          newgrp docker
        fi
        if ! command -v docker-compose &> /dev/null; then
          echo "Installing Docker Compose..."
          sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
          sudo chmod +x /usr/local/bin/docker-compose
        fi
        echo "Creating deployment directory..."
        mkdir -p /home/ubuntu/node-app
        echo "Stopping existing container..."
        cd /home/ubuntu/node-app
        docker-compose down || true
      EOF
    - echo "Copying updated files to EC2..."
    - scp -i ~/.ssh/ec2_key.pem -r docker-compose.yml $EC2_USER@$EC2_HOST:/home/ubuntu/node-app/
    - scp -i ~/.ssh/ec2_key.pem -r * $EC2_USER@$EC2_HOST:/home/ubuntu/node-app/
    - |
      ssh -i ~/.ssh/ec2_key.pem $EC2_USER@$EC2_HOST << 'EOF'
        set -e
        cd /home/ubuntu/node-app
        if [ ! -f docker-compose.yml ]; then
          echo "ERROR: docker-compose.yml not found! Exiting..."
          exit 1
        fi
        echo "Pulling latest Docker image from Docker Hub..."
        docker pull ram0810/node-app:latest
        echo "Starting new container..."
        docker-compose up -d
      EOF
```

## Explanation of the Pipeline

1. **Install Dependencies**
   - Installs necessary Node.js dependencies.
   - Caches `node_modules` to speed up subsequent builds.

2. **Run Tests**
   - Installs Mocha (test framework).
   - Runs unit tests (`npm test`).
   - Only runs on non-master branches.

3. **Build and Push Docker Image**
   - Logs into Docker Hub.
   - Builds a Docker image tagged with the commit SHA.
   - Pushes the built image to Docker Hub.
   - Updates the `latest` tag.

4. **Deploy on EC2**
   - Connects to the EC2 instance via SSH.
   - Ensures Docker and Docker Compose are installed.
   - Transfers updated files and stops existing containers.
   - Pulls the latest Docker image and restarts the container using `docker-compose`.

## Setting Up a GitLab Runner (Public)

1. Go to **GitLab -> Settings -> CI/CD -> Runners**.
2. Enable **shared/public runners**.
3. Verify your `.gitlab-ci.yml` configuration by pushing changes to the repository.

Once set up, GitLab CI/CD will execute the pipeline automatically on every commit.

---

This setup ensures that your Node.js application is tested, built, and deployed efficiently using GitLab CI/CD.
