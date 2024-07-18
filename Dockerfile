FROM python:latest

RUN apt-get update && apt-get dist-upgrade -y && apt-get install -y nodejs npm

WORKDIR /app
RUN mkdir adaptiveperf-html
COPY . adaptiveperf-html/
RUN pip install adaptiveperf-html/ && rm -rf adaptiveperf-html
RUN chgrp -R 0 /app && chmod -R g+rwX /app

EXPOSE 8000
ENTRYPOINT ["gunicorn", "-b", "0.0.0.0:8000", "adaptiveperf.app:app"]
