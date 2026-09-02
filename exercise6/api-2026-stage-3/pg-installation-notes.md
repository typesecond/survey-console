## Installation notes for Postgres

For the remaining exercises, you will need access to a Postgres database.
Postgres can be installed on a computer natively, but for our purposes it
may be better to use an off-the-shelf container. This container can run
either on your own computer (if you have docker or a compatible container
engine installed) or on another computer that can be reached via TCP/IP.
For instance, you could run it on an rlogin node; you could then connect
the computer on which you run the application to the rlogin node via port
forwarding.

## Setting up a database

We need a docker volume and a postgres container. The docker volume will be
used to hold the actual database content.

This must be run on a machine that has docker (or podman) installed.
You may use your own machine (if you have docker/podman installed) or
you may use rlogin. In the following, I'm assuming that a command `docker`
is available (on rlogin, `docker` is emulated by `podman`)

If you are using rlogin, note that rlogin actually contains 32 separate
machines. Any podman setup is _local_ to the rlogin node
you're working on. For instance, if you create a docker volume
on `oak`, it will be only on `oak`, and not on `hawthorn`.
See [here](https://wiki.cs.vt.edu/index.php/Howto::Access_rlogin_service) for
how to access specific rlogin nodes.

Minimal steps.

1. Create a docker volume

```
docker volume create pgdata
```

2. Create a network (we'll use this to be able to later add other containers
   to this network.)

```
docker network create pgnet
```

3. Download the postgres container. Let's use [Postgres 16](https://www.postgresql.org/docs/release/16.13/) for this project. The officially supported
   container is documented [here](https://github.com/docker-library/docs/blob/master/postgres/README.md).

```
docker pull postgres:16
```

4. Start the postgres container.

Based on the settings in the `config/` directory, you can use the script
`npx tsx scripts/print_db_docker_run.mjs` to output a command that shows
how to start it. For example, like so:

```
loginctl enable-linger

docker run -d\
    --network pgnet\
    --network-alias postgres\
    --name 'appdb-db'\
    -e POSTGRES_DB='appdb'\
    -e POSTGRES_USER='appuser'\
    -e POSTGRES_PASSWORD='appsecret'\
    -v pgdata:/var/lib/postgresql\
    -p 'XXXX':5432\
    postgres:16
```

where XXXX must be replaced with a unique port. Each student using
a specific rlogin machine must use a unique port not in use by another
student. You may pick 22,000 plus the last 3 digits of your student id,
for instance.

It is worth the time to understand the arguments given to docker in
the above command.

- -d means to run this container in the background ("detached").
  Note that on rlogin, containers are periodically killed unless you
  run `loginctl enable-linger`.

- --network pgnet attaches this container to the previously created `pgnet`
  network. Using a docker network here will allow us to add containers
  to the same network that can communicate with this container.

- --network-alias postgres creates a DNS alias on that network.

- --name `appdb-db` is the name of the container under which you can find
  it when running `docker ps`

- The -e switches provide environment variables to postgres will control
  the database name, user and password.

- The -v switch mounts the `pgdata` volume under `/var/lib/postgresql` inside
  the container, which is where Postgres stores its data

- The -p switch forwards port `XXXX` to internal port 5432, which is where
  the Postgres database server listens for connections.

You should be able to test it by running:

```
gback@oak pgtest]$ docker exec -it appdb-db psql -U appuser appdb
Emulate Docker CLI using podman. Create /etc/containers/nodocker to quiet msg.
psql (16.13 (Debian 16.13-1.pgdg13+1))
Type "help" for help.

postgres=#
```

(This means: "execute the psql command after entering the appdb-db container,
passing it the user appuser and selecting appdb"; connection from within
the container do not require a password.)

You can also connect to it from your local computer if you use ssh port
forwarding. For example, if you run

```
ssh -L 5432:oak.rlogin:4001 <yourcspid>@rlogin.cs.vt.edu
```

on your own computer, and leave this terminal open, and you have the
postgres client `psql` installed, then you can run

```
$ PGPASSWORD=appsecret psql -h localhost -U appuser -d appdb
psql (16.13 (Ubuntu 16.13-0ubuntu0.24.04.1))
Type "help" for help.

appdb=#
```

and connect to the database from your own computer via the following:

- psql connects to localhost (your computer), using the postgres default
  port 5432.
- ssh forwards port 5432 on your computer to oak.rlogin port 4001.
- on oak.rlogin, port 4001 is bound to port 5432 inside the postgres
  container.
- you need to replace 4001 with the XXXX port you chose above.
