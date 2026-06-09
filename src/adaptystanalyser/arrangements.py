# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import json
import hashlib
import os
import paqpy
import sqlalchemy as sql
import sqlalchemy.orm as orm
import sqlalchemy.engine
from datetime import datetime, timezone
from pathlib import Path


class Context:
    def __init__(self, url=None, password=None):
        if url is None:
            p = Path.home() / '.adaptyst_analyser'
            p.mkdir(exist_ok=True)

            db_path = p / 'db.sqlite'
            db_path = db_path.resolve()

            database_url = 'sqlite:///' + str(db_path)
        else:
            database_url = sqlalchemy.engine.make_url(url)

            if password is not None:
                database_url.password = password

        self._engine = sql.create_engine(database_url, echo=True)
        Base.metadata.create_all(self._engine)

    def __enter__(self):
        return self

    def __exit__(self, exception_type, exception_value,
                 exception_traceback):
        if not self.is_closed():
            self.close()

        return False

    def is_closed(self):
        return self._engine is None

    def close(self):
        self._engine.dispose()
        self._engine = None

    def check_name(self, name: str) -> bool:
        with orm.Session(self._engine) as session:
            results = session.scalars(
                sql.select(Arrangement).where(
                    Arrangement.name == name))

            return results.first() is not None

    def save(self, name: str, data: str, storage_path: Path) \
            -> (str, str):
        with orm.Session(self._engine) as session:
            results = session.scalars(
                sql.select(Arrangement).where(
                    Arrangement.name == name))
            arrgmt = results.first()

            if arrgmt is not None:
                raise FileExistsError

            data_decoded = json.loads(data)
            if 'main_window' in data_decoded:
                a_type = 'SW'
            else:
                a_type = 'W'

            arrgmt = Arrangement(name=name,
                                 a_type=a_type,
                                 last_update=datetime.now(
                                     timezone.utc),
                                 data=data)
            token_to_return = arrgmt.gen_token()
            session.add(arrgmt)
            session.commit()

            try:
                perf_sessions = set()

                def add_session(name):
                    if name is not None and \
                       (arrgmt.a_id, name) not in perf_sessions:
                        s = Session(a_id=arrgmt.a_id, name=name)
                        s.gen_fingerprint(storage_path)
                        session.add(s)
                        perf_sessions.add((arrgmt.a_id, name))

                if 'session' in data_decoded:
                    add_session(data_decoded['session'])

                if 'main_window' in data_decoded:
                    add_session(data_decoded['main_window'].get(
                        'session', None))

                    for w in data_decoded.get('other_windows', {}).values():
                        add_session(w.get('session', None))
                else:
                    for w in data_decoded.get('windows', {}).values():
                        add_session(w.get('session', None))

                session.commit()
            except Exception as e:
                session.rollback()
                session.delete(arrgmt)
                session.commit()
                raise e

            return arrgmt.a_id, token_to_return

    def edit_name(self, name: str, new_name: str, token: str):
        with orm.Session(self._engine) as session:
            results_new_name_check = session.scalars(
                sql.select(Arrangement).where(
                    Arrangement.name == new_name))

            if results_new_name_check.first() is not None:
                raise FileExistsError

            results = session.scalars(
                sql.select(Arrangement).where(
                    Arrangement.name == name))
            arrgmt = results.first()

            if arrgmt is None:
                raise FileNotFoundError

            if not arrgmt.check_token(token):
                raise PermissionError

            arrgmt.name = new_name
            arrgmt.last_update = datetime.now(timezone.utc)
            session.commit()

    def delete(self, name, token):
        with orm.Session(self._engine) as session:
            results = session.scalars(
                sql.select(Arrangement).where(
                    Arrangement.name == name))
            arrgmt = results.first()

            if arrgmt is None:
                raise FileNotFoundError

            if not arrgmt.check_token(token):
                raise PermissionError

            session.execute(sql.delete(Session).where(
                Session.a_id == arrgmt.a_id))

            session.delete(arrgmt)
            session.commit()

    def _get(self, session, results, storage_path):
        arrgmt = results.first()

        if arrgmt is None:
            raise FileNotFoundError

        perf_session_results = session.scalars(
            sql.select(Session).where(
                Session.a_id == arrgmt.a_id))

        for perf_session in perf_session_results:
            if not perf_session.check_fingerprint(storage_path):
                raise ValueError(perf_session.name)

        return arrgmt.data

    def get_by_id(self, identifier, storage_path):
        with orm.Session(self._engine) as session:
            return self._get(session,
                             session.scalars(
                                 sql.select(Arrangement).where(
                                     Arrangement.a_id == identifier)),
                             storage_path)

    def get_by_name(self, name, storage_path):
        with orm.Session(self._engine) as session:
            return self._get(session,
                             session.scalars(
                                 sql.select(Arrangement).where(
                                     Arrangement.name == name)),
                             storage_path)

    def get_list(self, search, limit, page, sort, types):
        try:
            limit = int(limit)
            page = int(page)
        except Exception:
            raise ValueError

        if page < 1:
            raise ValueError

        if sort == 'last_update_desc':
            order_by = sql.desc(Arrangement.last_update)
        elif sort == 'last_update_asc':
            order_by = sql.asc(Arrangement.last_update)
        elif sort == 'name_desc':
            order_by = sql.desc(Arrangement.name)
        elif sort == 'name_asc':
            order_by = sql.asc(Arrangement.name)
        else:
            raise ValueError

        if types == 'both':
            where = [True]
        elif types == 'W':
            where = [Arrangement.a_type == 'W']
        elif types == 'SW':
            where = [Arrangement.a_type == 'SW']
        else:
            raise ValueError

        if search is not None:
            where.append(Arrangement.name.regexp_match(search))

        with orm.Session(self._engine) as session:
            results = session.scalars(
                sql.select(Arrangement).where(*where).order_by(
                    order_by).limit(limit).offset((page - 1) * limit))
            cnt = session.query(
                sql.func.count(Arrangement.a_id)).where(*where).scalar()

            return cnt, max(1, (cnt // limit) +
                            (1 if cnt % limit > 0 else 0)), \
                list(map(Arrangement.to_dict, results))


class Base(orm.DeclarativeBase):
    pass


class Arrangement(Base):
    __tablename__ = 'arrangement'

    a_id: orm.Mapped[int] = orm.mapped_column(primary_key=True)
    name: orm.Mapped[str] = orm.mapped_column(unique=True)
    a_type: orm.Mapped[str]
    last_update: orm.Mapped[datetime]
    token: orm.Mapped[str]
    token_salt: orm.Mapped[bytes]
    data: orm.Mapped[str]

    def gen_token(self):
        token_to_return = os.urandom(32).hex()
        self.token_salt = os.urandom(32)
        self.token = hashlib.pbkdf2_hmac('sha256',
                                         token_to_return.encode('utf-8'),
                                         self.token_salt,
                                         600000).hex()
        return token_to_return

    def check_token(self, user_token):
        hashed_token = hashlib.pbkdf2_hmac('sha256',
                                           user_token.encode('utf-8'),
                                           self.token_salt,
                                           600000).hex()
        return hashed_token == self.token

    def to_dict(self):
        return {
            'id': self.a_id,
            'name': self.name,
            'type': self.a_type,
            'last_update': str(self.last_update),
        }

    def __str__(self):
        return json.dumps(self.to_dict())


class Session(Base):
    __tablename__ = 'session'

    a_id: orm.Mapped[int] = orm.mapped_column(
        sql.ForeignKey('arrangement.a_id'),
        primary_key=True)
    name: orm.Mapped[str] = orm.mapped_column(primary_key=True)
    fingerprint: orm.Mapped[str]
    last_update_or_successful_check: orm.Mapped[datetime]

    def gen_fingerprint(self, storage_path: Path):
        p = storage_path / self.name
        if not p.exists():
            raise FileNotFoundError(str(p))

        self.fingerprint = paqpy.hash_source(str(p), True)
        self.last_update_or_successful_check = \
            datetime.now(timezone.utc)

    def check_fingerprint(self, storage_path: Path):
        p = storage_path / self.name
        if not p.exists():
            return False

        fingerprint = paqpy.hash_source(str(p), True)
        if fingerprint == self.fingerprint:
            self.last_update_or_successful_check = \
                datetime.now(timezone.utc)
            return True
        else:
            return False
