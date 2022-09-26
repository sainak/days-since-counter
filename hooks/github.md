## using shell alias

```sh
reset-git-counter () {
    curl -X PUT -u "user:secure password" http://localhost:8787/I-pushed-to-github
}
alias gitpush = "reset-git-counter && git push"
```

## using webhooks

You'll need to setup webhook for each repository you want to track. If you still want to do it read these [docs](https://docs.github.com/en/developers/webhooks-and-events/webhooks/creating-webhooks).