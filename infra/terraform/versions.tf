terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # Remote state (recommended). Create the bucket + lock table once, then uncomment:
  # backend "s3" {
  #   bucket         = "cooper-waters-tfstate"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-southeast-2"
  #   dynamodb_table = "cooper-waters-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "cooper-waters", Environment = var.environment, ManagedBy = "terraform" }
  }
}

# CloudFront certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
