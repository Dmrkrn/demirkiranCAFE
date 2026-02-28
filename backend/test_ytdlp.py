import subprocess
import sys

def get_stream_url(search_query):
    yt_dlp_args = [
        'yt-dlp',
        '-f', 'bestaudio',
        '--get-url',
        '--no-playlist',
        '--match-filter', 'duration > 60',
        search_query
    ]
    
    print(f"Running: {' '.join(yt_dlp_args)}")
    try:
        result = subprocess.run(yt_dlp_args, capture_output=True, text=True, check=True)
        url = result.stdout.strip()
        print(f"Extracted URL:\n{url}")
        return url
    except subprocess.CalledProcessError as e:
        print(f"Error: {e.stderr}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_ytdlp.py <search_query>")
        sys.exit(1)
        
    query = sys.argv[1]
    url = get_stream_url(query)
