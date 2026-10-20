# Temporary HTTPS for the API when no domain/certificate is configured yet.
#
# Without api_certificate_arn the load balancer only speaks plain HTTP, and browsers block the
# HTTPS admin dashboard from calling an HTTP API. This puts CloudFront in front of the load
# balancer so the API gets a free https://<id>.cloudfront.net address. Nothing is cached:
# every request (including WebSocket upgrades and cookies for Socket.IO stickiness) is passed
# through to the load balancer.
#
# Once api_domain + api_certificate_arn are set, this distribution is removed and the API is
# served directly by the load balancer over HTTPS.

resource "aws_cloudfront_distribution" "api" {
  count       = local.https ? 0 : 1
  enabled     = true
  comment     = "${local.name} API (temporary HTTPS)"
  price_class = "PriceClass_All"

  origin {
    domain_name = aws_lb.api.dns_name
    origin_id   = "api-alb"
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
