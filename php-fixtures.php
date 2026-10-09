<?php
// Only the automated test harness may point this CLI helper at a disposable database.
if(PHP_SAPI!=='cli'||!getenv('ARAL_DB_PATH'))exit(1);
require dirname(__DIR__).'/server/db.php';
$db=database();
if(($argv[1]??'')==='teacher')query($db,"UPDATE users SET role='teacher' WHERE email=?",[$argv[2]]);
if(($argv[1]??'')==='audit')echo json_encode(query($db,'SELECT email,password_hash,role FROM users')->fetchAll());
