#!/bin/zsh
# Installs (or removes, with --uninstall) the Writer of the Day cron job.
# The job runs every 15 minutes; the script itself decides whether it's time
# for today's notification, so missed times are caught up and you never get
# more than one per day.

DIR="${0:A:h}"
MARKER="# writer-of-the-day"
ENTRY="*/15 * * * * /usr/bin/python3 \"$DIR/writer_of_the_day.py\" >> \"$DIR/cron.log\" 2>&1 $MARKER"

existing="$(crontab -l 2>/dev/null | grep -v "$MARKER")"

if [[ "$1" == "--uninstall" ]]; then
  if [[ -n "$existing" ]]; then
    print -r -- "$existing" | crontab -
  else
    crontab -r 2>/dev/null
  fi
  echo "Removed Writer of the Day cron job."
  exit 0
fi

print -r -- "${existing:+$existing
}$ENTRY" | crontab -
echo "Installed. Current crontab:"
crontab -l
