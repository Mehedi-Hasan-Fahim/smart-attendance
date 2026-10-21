import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return pymysql.connect(
        host=os.getenv("TIDB_HOST"),
        port=int(os.getenv("TIDB_PORT")),
        user=os.getenv("TIDB_USER"),
        password=os.getenv("TIDB_PASSWORD"),
        database="test", # TiDB ডিফল্ট 'test' ডেটাবেজ ব্যবহার করছি
        ssl={'ssl': {}}, # TiDB ক্লাউডের জন্য SSL বাধ্যতামূলক
        autocommit=True
    )
