# Use fluentd base image
FROM fluent/fluentd:v1.14-1

# Switch to root user for package installation
USER root

# Install fluent-plugin-mail and other dependencies
RUN apk update && apk add --no-cache bash \
    && gem install fluent-plugin-mail
