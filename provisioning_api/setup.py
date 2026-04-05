from setuptools import find_packages, setup

setup(
    name="provisioning_api",
    version="0.1.0",
    description="Internal provisioning API for ERP-side operations",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
)
