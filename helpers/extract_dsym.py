import argparse
import os
import glob
import subprocess

def upload_to_sentry(dsym_path):
    print(f"Uploading {dsym_path} to Sentry")

    authToken = os.environ.get('SENTRY_AUTH_TOKEN')
    url = os.environ.get('SENTRY_URL')
    org = os.environ.get('SENTRY_ORG')
    project = os.environ.get('SENTRY_PROJECT')

    result = subprocess.check_output([
        "sentry-cli",
        '--auth-token', authToken,
        '--url', url,
        'upload-dif', '--include-sources',
        '--org', org,
        '--project', project,
        dsym_path
    ]).decode('utf-8')

    print(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="directory to extract dsym from")
    parser.add_argument("output", help="output directory")

    args = parser.parse_args()

    files = glob.glob(os.path.join(os.path.abspath(args.input), "**", "*.dylib"), recursive=True)
    files = sorted(files)

    outdir = os.path.abspath(args.output)

    if not os.path.exists(outdir):
        os.makedirs(outdir)

    for file in files:
        if os.path.islink(file):
            continue

        file_name = os.path.basename(file)

        out_dsym = os.path.join(outdir, file_name + ".dSYM")

        if os.path.exists(out_dsym):
            continue

        subprocess.check_call(["dsymutil", file, "-o", out_dsym])

        print(f"{file_name} -> {file_name}.dSYM")

        upload_to_sentry(out_dsym)
