#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 VM to become a kubeadm node (note 19).
# Run on every node:  sudo K8S_MINOR=v1.35 bash node-setup.sh
set -euo pipefail

K8S_MINOR="${K8S_MINOR:-v1.35}"

# 1. No swap (the kubelet's default config refuses to start with swap on)
swapoff -a
sed -i '/\sswap\s/ s/^/#/' /etc/fstab

# 2. Kernel modules and sysctls for container networking
cat >/etc/modules-load.d/k8s.conf <<EOF
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

cat >/etc/sysctl.d/k8s.conf <<EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system >/dev/null

# 3. containerd, using the systemd cgroup driver to match the kubelet
apt-get update -q
apt-get install -y -q containerd apt-transport-https ca-certificates curl gpg
mkdir -p /etc/containerd
containerd config default >/etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl restart containerd
systemctl enable containerd

# 4. kubeadm, kubelet, kubectl from pkgs.k8s.io (one repository per minor version)
mkdir -p /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/${K8S_MINOR}/deb/Release.key" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/${K8S_MINOR}/deb/ /" \
  >/etc/apt/sources.list.d/kubernetes.list
apt-get update -q
apt-get install -y -q kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
systemctl enable kubelet

# 5. crictl talks to containerd
cat >/etc/crictl.yaml <<EOF
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
EOF

echo "Node ready for kubeadm: $(kubeadm version -o short)"
