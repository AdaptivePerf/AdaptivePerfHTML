FROM gitlab-registry.cern.ch/syclops/linux/python-with-perf:latest

WORKDIR /root
RUN mkdir adaptiveperf-html
COPY * adaptiveperf-html/
RUN pip install adaptiveperf-html/

EXPOSE 8000
ENTRYPOINT ["gunicorn", "-b", "0.0.0.0:8000", "adaptiveperf.app:app"]
