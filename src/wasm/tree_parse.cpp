#include <iostream>
#include <fstream>
#include <nlohmann/json.hpp>
#include <vector>
#include <unordered_map>
#include "tree_parse.hpp"

using json = nlohmann::json;


TreeNode parse_json_to_tree(const json& j_node) {
    TreeNode node;
    node.name = j_node.value("name", "");
    node.value = 0;
    
    if (j_node.contains("value")) {
        if (j_node["value"].is_number_unsigned()) {
            node.value = j_node["value"].get<uint64_t>();
        } else if (j_node["value"].is_number_integer()) {
            node.value = static_cast<uint64_t>(j_node["value"].get<int64_t>());
        }
    }

    node.cold = j_node.value("cold", false);
    node.left_sum = 0;

    if (j_node.contains("children")) {
        for (const auto& child : j_node["children"]) {
            node.children.push_back(parse_json_to_tree(child));
        }
    }
    return node;
}

uint64_t calculate_left_sum(TreeNode& node, uint64_t& running_sum) {
    if (node.children.empty()) {
        node.left_sum = running_sum; //left_sum is the starting_time for the current function
        running_sum += node.value;  // sum of leaf values (walltimes) to the left = start_time current
        } else {
        for (auto& child : node.children) {
            calculate_left_sum(child, running_sum);
        }
        if (!node.children.empty()) {
            node.left_sum = node.children.front().left_sum; //parent start_time = left most child start_time
        }
    }
    return node.left_sum;
}

TreeNode prune_tree(const TreeNode& node, uint64_t threshold_left, uint64_t threshold_right) {
    TreeNode pruned_node = node;

    pruned_node.children.clear();

    for (const auto& child : node.children) {
        //this includes all the functions that have any overlap with the time between the two thresholds
        if ((child.left_sum + child.value) > threshold_left && (child.left_sum) < threshold_right) {
            pruned_node.children.push_back(prune_tree(child, threshold_left, threshold_right));
        }
    }

    uint64_t extra_time_left = threshold_left > node.left_sum ? threshold_left - node.left_sum : 0;
    uint64_t extra_time_right = (node.left_sum + node.value) > threshold_right ? node.left_sum + node.value - threshold_right : 0;
    pruned_node.value = node.value - extra_time_left - extra_time_right; //substract extra left + right time intervals from walltime if any

    return pruned_node;
}

json tree_to_json(const TreeNode& node) {
    json j_node;
    j_node["name"] = node.name;
    j_node["value"] = node.value;
    j_node["left_sum"] = node.left_sum;
    j_node["cold"] = node.cold;

    for (const auto& child : node.children) {
        j_node["children"].push_back(tree_to_json(child));
    }

    return j_node;
}

void save_json_to_file(const json& j, const std::string& filename) {
    std::ofstream file(filename);
    if (file.is_open()) {
        file << j.dump();
        file.close();
    } else {
        std::cerr << "Unable to open file: " << filename << std::endl;
    }
}

void print_tree(const TreeNode& node, int level) {
    std::string indent(level * 2, ' ');
    std::cout << indent << "Name: " << node.name << ", Value: " << node.value << ", Left Sum: " << node.left_sum << "\n";
    for (const auto& child : node.children) {
        print_tree(child, level + 1);
    }
}
