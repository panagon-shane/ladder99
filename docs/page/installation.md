# Installation

## Install Git

**Git** gives us access to the source code for Ladder99, and also provides a console on Windows that acts more like a Linux console. 

You can install it from https://git-scm.com/downloads.


## Open Terminal

Open a terminal window (if on Windows, use Git Bash), and go to a good working directory - e.g. the Desktop or your home directory. 


## Install Docker

**Docker** lets us run the different parts of the pipeline in a consistent way on different platforms.

First check if it's on your system -

```
docker version
```

If not there, install it - https://docs.docker.com/get-docker/.


## Install Docker Compose

Ladder99 uses **Docker Compose** to orchestrate the different services - check if you have it with

```
docker-compose version
```

Install or upgrade it at https://docs.docker.com/compose/install/.


## Install Ladder99

Next, install the Ladder99 pipeline source code by cloning the code from GitHub -

```
git clone https://github.com/Ladder99/ladder99
cd ladder99
```

Then check out the latest branch with -

```
git checkout historian
```