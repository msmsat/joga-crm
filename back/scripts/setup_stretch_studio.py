"""Preview first; --apply configures the explicitly selected approved stretch studio."""
import argparse
import asyncio
import json
import os
from pathlib import Path


async def run(args):
    from database import async_session_maker, engine
    from services.stretch_setup import setup_studio
    try:
        result = await setup_studio(async_session_maker, studio_id=args.studio_id,
            owner_email=args.owner_email, apply=args.apply)
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temp = path.with_suffix(path.suffix+'.tmp')
        fd = os.open(temp, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2)
        temp.replace(path)
        print(f'Report: {path}')
        print(json.dumps({key:result.get(key) for key in
            ('studio_id','owner_id','ready','complete','services','weekly_templates','schedule','error')},
            ensure_ascii=False, indent=2))
        return 0 if result['ready'] else 1
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner-email', required=True)
    parser.add_argument('--studio-id', required=True, type=int)
    parser.add_argument('--report', required=True)
    parser.add_argument('--apply', action='store_true', help='Save configuration; default is rollback preview')
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args)))


if __name__ == '__main__':
    main()
