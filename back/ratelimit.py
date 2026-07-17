"""Общий limiter для публичных эндпоинтов (задача 11b).

Отдельный модуль, чтобы main.py (регистрация) и routers/booking/public.py
(декораторы) делили один экземпляр без циклического импорта.
Ключ — IP клиента. In-memory storage: одному процессу достаточно; для нескольких
воркеров нужен Redis-бэкенд (limits это умеет), но для MVP это оверкилл.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
