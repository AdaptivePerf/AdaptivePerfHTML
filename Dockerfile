FROM gitlab-registry.cern.ch/syclops/linux/python-with-perf:latest

WORKDIR /root
COPY * .
RUN pip install -r requirements.txt

EXPOSE 8000
ENTRYPOINT ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
