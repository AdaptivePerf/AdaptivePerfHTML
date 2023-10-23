FROM gitlab-registry.cern.ch/syclops/linux/python-with-perf:latest

WORKDIR /app
RUN mkdir adaptiveperf-html
COPY * adaptiveperf-html/
RUN pip install adaptiveperf-html/ && rm -rf adaptiveperf-html
RUN chgrp -R 0 /app && chmod -R g+rwX /app

EXPOSE 8000
ENTRYPOINT ["gunicorn", "-b", "0.0.0.0:8000", "adaptiveperf.app:app"]
