"""Отправка в мессенджеры: единственное место в системе, откуда уходят сообщения.

Роутер — граница вебхука, канал — сеть. Классификация исхода попытки и общие
константы лежат в base.py (там же самопроверка), транспорт каждого канала — в
своём модуле.
"""
from .base import ACCEPTED, AUTH, PERMANENT, RETRY, UNKNOWN, SendResult, classify

__all__ = ["ACCEPTED", "AUTH", "PERMANENT", "RETRY", "UNKNOWN", "SendResult", "classify"]
